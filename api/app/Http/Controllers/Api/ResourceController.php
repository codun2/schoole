<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\Activity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Declarative CRUD for a tenant model. Subclasses describe the resource
 * (model, searchable columns, exact-match filters, eager loads, validation)
 * and override the hooks only where a screen needs real business logic.
 *
 * Query params understood by index():
 *   q=…            free-text search over $search columns (dot = relation column)
 *   <filter>=…     exact match for every key listed in $filters
 *   from/to=Y-m-d  date range over $dateColumn
 *   year=ID        academic year (defaults to the school's current year when $yearScoped)
 *   all=1          return every row (no pagination) — for selects and exports
 *   sort=col&dir=asc|desc
 */
abstract class ResourceController extends Controller
{
    /** @var class-string<Model> */
    protected string $model;

    protected array $search = [];

    protected array $filters = [];

    protected array $with = [];

    protected array $withCount = [];

    protected array $showWith = [];

    protected array $sortable = ['id', 'created_at'];

    protected string $order = 'id';

    protected string $dir = 'desc';

    protected ?string $dateColumn = null;

    protected bool $yearScoped = false;

    protected int $perPage = 25;

    /** Arabic label used in the activity log. */
    protected string $label = 'سجل';

    abstract protected function rules(Request $request, ?Model $record): array;

    public function index(Request $request)
    {
        $query = $this->baseQuery($request);
        $this->applyListFilters($query, $request);

        $sort = in_array($request->sort, $this->sortable, true) ? $request->sort : $this->order;
        $dir = $request->dir === 'asc' ? 'asc' : ($request->dir === 'desc' ? 'desc' : $this->dir);
        $query->orderBy($sort, $dir);
        if ($sort !== 'id') {
            $query->orderBy('id', $dir); // stable tiebreaker → within equal values the newest row leads (for desc)
        }

        if ($request->boolean('all')) {
            $rows = $query->limit(5000)->get();

            return response()->json(['data' => $this->transformAll($rows), 'total' => $rows->count()]);
        }

        $page = $query->paginate(min((int) ($request->per_page ?: $this->perPage), 200));
        $page->setCollection($this->transformAll($page->getCollection()));

        return response()->json($page);
    }

    public function show(Request $request, $id)
    {
        $record = $this->find($id);
        $record->load(array_merge($this->with, $this->showWith));
        if ($this->withCount) {
            $record->loadCount($this->withCount);
        }

        return response()->json($this->transform($record, true));
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules($request, null));

        $record = DB::transaction(function () use ($data, $request) {
            $data = $this->prepare($data, $request, null);
            $record = new $this->model;
            $record->fill($data);
            if ($this->yearScoped && empty($record->academic_year_id)) {
                $record->academic_year_id = $this->yearId($request);
            }
            $record->save();
            $this->afterSave($record, $request, true);

            return $record;
        });

        Activity::log('create', $record, $this->label.': '.$this->describe($record));

        return response()->json($this->transform($record->fresh($this->with), true), 201);
    }

    public function update(Request $request, $id)
    {
        $record = $this->find($id);
        $data = $request->validate($this->rules($request, $record));

        DB::transaction(function () use ($data, $request, $record) {
            $data = $this->prepare($data, $request, $record);
            $record->fill($data)->save();
            $this->afterSave($record, $request, false);
        });

        Activity::log('update', $record, $this->label.': '.$this->describe($record));

        return response()->json($this->transform($record->fresh($this->with), true));
    }

    public function destroy(Request $request, $id)
    {
        $record = $this->find($id);
        if ($reason = $this->cannotDelete($record)) {
            return response()->json(['message' => $reason], 422);
        }
        DB::transaction(function () use ($record) {
            $this->beforeDelete($record);
            $record->delete();
        });

        Activity::log('delete', $record, $this->label.': '.$this->describe($record));

        return response()->json(['message' => 'تم الحذف بنجاح.']);
    }

    // ------------------------------------------------------------------ hooks

    protected function baseQuery(Request $request): Builder
    {
        $q = $this->model::query()->with($this->with);
        if ($this->withCount) {
            $q->withCount($this->withCount);
        }

        return $q;
    }

    protected function applyListFilters(Builder $query, Request $request): void
    {
        if ($this->yearScoped && $request->year !== 'all') {
            $query->where($query->getModel()->getTable().'.academic_year_id', $this->yearId($request));
        }

        if (($term = trim((string) $request->q)) !== '' && $this->search) {
            $query->where(function (Builder $w) use ($term) {
                foreach ($this->search as $col) {
                    if (str_contains($col, '.')) {
                        [$rel, $c] = explode('.', $col, 2);
                        $w->orWhereHas($rel, fn ($r) => $r->where($c, 'like', "%{$term}%"));
                    } else {
                        $w->orWhere($col, 'like', "%{$term}%");
                    }
                }
            });
        }

        foreach ($this->filters as $f) {
            $v = $request->query($f);
            if ($v !== null && $v !== '') {
                $query->where($f, $v);
            }
        }

        if ($this->dateColumn) {
            if ($request->from) {
                $query->whereDate($this->dateColumn, '>=', $request->from);
            }
            if ($request->to) {
                $query->whereDate($this->dateColumn, '<=', $request->to);
            }
        }

        $this->extraFilters($query, $request);
    }

    protected function extraFilters(Builder $query, Request $request): void {}

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        return $data;
    }

    protected function afterSave(Model $record, Request $request, bool $created): void {}

    protected function cannotDelete(Model $record): ?string
    {
        return null;
    }

    protected function beforeDelete(Model $record): void {}

    protected function transform(Model $record, bool $detail = false)
    {
        return $record;
    }

    protected function transformAll($rows)
    {
        return $rows->map(fn ($r) => $this->transform($r));
    }

    protected function describe(Model $record): string
    {
        return (string) ($record->name ?? $record->title ?? $record->number ?? $record->name_ar ?? ('#'.$record->getKey()));
    }

    // ----------------------------------------------------------- offline sync

    /** Rows for the offline mirror: same eager loads as index(), without year/pagination filters. */
    public function syncQuery(): Builder
    {
        return $this->baseQuery(request());
    }

    /** Same per-row shaping the list endpoint applies. */
    public function syncTransform($rows)
    {
        return $this->transformAll($rows);
    }

    // ---------------------------------------------------------------- helpers

    protected function find($id): Model
    {
        return $this->model::query()->findOrFail($id);
    }

    /** The academic year a request works in: ?year=ID, else the school's current year. */
    protected function yearId(Request $request): ?int
    {
        if ($request->year && $request->year !== 'all') {
            return (int) $request->year;
        }

        return $request->user()->company?->currentYearId();
    }
}

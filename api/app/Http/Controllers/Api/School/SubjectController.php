<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\ResourceController;
use App\Models\GradeMark;
use App\Models\Subject;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class SubjectController extends ResourceController
{
    protected string $model = Subject::class;

    protected array $search = ['name_ar', 'name_en', 'code'];

    protected array $filters = [];

    protected array $with = ['grade:id,name_ar'];

    protected array $sortable = ['id', 'sort', 'name_ar'];

    protected string $order = 'sort';

    protected string $dir = 'asc';

    protected bool $yearScoped = true;

    protected string $label = 'مادة دراسية';

    protected function rules(Request $request, ?Model $record): array
    {
        $req = $record ? 'sometimes' : 'required';

        return [
            'name_ar'   => [$req, 'string', 'max:120'],
            'name_en'   => ['nullable', 'string', 'max:120'],
            'code'       => ['nullable', 'string', 'max:20'],
            'grade_id'   => ['nullable', 'integer', $this->owned('grades')], // legacy single grade (kept in sync)
            'grade_ids'  => ['nullable', 'array'], // [] / absent = applies to all grades
            'grade_ids.*' => ['integer', $this->owned('grades')],
            'max_mark'   => ['nullable', 'numeric', 'min:1', 'max:1000'],
            'pass_mark'  => ['nullable', 'numeric', 'min:0'],
            'sort'       => ['nullable', 'integer', 'min:0'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if (array_key_exists('grade_ids', $data)) {
            $ids = array_values(array_unique(array_map('intval', $data['grade_ids'] ?? [])));
            $data['grade_ids'] = $ids ?: null;        // empty selection → applies to all grades
            $data['grade_id'] = $ids[0] ?? null;      // keep the legacy column pointing at the first grade
        }
        if (array_key_exists('sort', $data) && $data['sort'] === null) {
            $data['sort'] = 0; // empty form field → column default (the column is NOT NULL)
        }

        return $data;
    }

    protected function extraFilters(Builder $query, Request $request): void
    {
        // ?for_grade=ID (used by marks/timetable) and the list's ?grade_id=ID filter both mean:
        // subjects that apply to that grade — the ones listing it, plus the "all grades" ones.
        $gid = $request->input('for_grade', $request->input('grade_id'));
        if (filled($gid)) {
            $query->where(fn ($w) => $w->whereNull('grade_ids')->orWhereJsonContains('grade_ids', (int) $gid));
        }
    }

    protected function cannotDelete(Model $record): ?string
    {
        return GradeMark::where('subject_id', $record->id)->exists() ? 'لا يمكن حذف مادة مرصودة فيها درجات.' : null;
    }
}

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

    protected array $filters = ['grade_id'];

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
            'code'      => ['nullable', 'string', 'max:20'],
            'grade_id'  => ['nullable', 'integer', $this->owned('grades')],
            'max_mark'  => ['nullable', 'numeric', 'min:1', 'max:1000'],
            'pass_mark' => ['nullable', 'numeric', 'min:0'],
            'sort'      => ['nullable', 'integer', 'min:0'],
        ];
    }

    protected function extraFilters(Builder $query, Request $request): void
    {
        // ?for_grade=ID → subjects that apply to that grade (its own + the "all grades" ones)
        if ($request->filled('for_grade')) {
            $query->where(fn ($w) => $w->whereNull('grade_id')->orWhere('grade_id', $request->for_grade));
        }
    }

    protected function cannotDelete(Model $record): ?string
    {
        return GradeMark::where('subject_id', $record->id)->exists() ? 'لا يمكن حذف مادة مرصودة فيها درجات.' : null;
    }
}

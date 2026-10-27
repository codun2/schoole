<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\ResourceController;
use App\Models\FeeItem;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class FeeItemController extends ResourceController
{
    protected string $model = FeeItem::class;

    protected array $search = ['name'];

    protected array $filters = ['type'];

    protected array $with = ['grade:id,name_ar,name_en'];

    protected bool $yearScoped = true;

    protected string $label = 'بند رسوم';

    public const TYPES = ['tuition', 'registration', 'books', 'uniform', 'bus', 'activity', 'other'];

    protected function rules(Request $request, ?Model $record): array
    {
        $req = $record ? 'sometimes' : 'required';

        return [
            'name'         => [$req, 'string', 'max:255'],
            'name_en'      => ['nullable', 'string', 'max:255'],
            'type'         => ['nullable', 'in:'.implode(',', self::TYPES)],
            'amount'       => [$req, 'numeric', 'min:0'],
            'grade_id'     => ['nullable', 'integer', $this->owned('grades')],
            'is_mandatory' => ['boolean'],
            'taxable'      => ['boolean'],
        ];
    }

    /** ?for_grade=ID returns the items that apply to that grade (its own + the "all grades" ones). */
    protected function extraFilters(Builder $query, Request $request): void
    {
        if ($request->filled('grade_id')) {
            $query->where('grade_id', $request->grade_id);
        }
        if ($request->filled('for_grade')) {
            $query->where(fn ($w) => $w->whereNull('grade_id')->orWhere('grade_id', $request->for_grade));
        }
    }
}

<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Api\ResourceController;
use App\Models\EvaluationCriterion;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class EvaluationCriterionController extends ResourceController
{
    protected string $model = EvaluationCriterion::class;

    protected array $search = ['name'];

    protected string $order = 'sort';

    protected string $dir = 'asc';

    protected array $sortable = ['id', 'sort'];

    protected string $label = 'معيار تقييم';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'      => [$record ? 'sometimes' : 'required', 'string', 'max:160'],
            'weight'    => ['nullable', 'numeric', 'min:0', 'max:100'],
            'max_score' => ['nullable', 'numeric', 'min:1'],
            'sort'      => ['nullable', 'integer', 'min:0'],
        ];
    }
}

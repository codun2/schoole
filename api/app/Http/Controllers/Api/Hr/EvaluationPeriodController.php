<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Api\ResourceController;
use App\Models\Evaluation;
use App\Models\EvaluationPeriod;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class EvaluationPeriodController extends ResourceController
{
    protected string $model = EvaluationPeriod::class;

    protected array $search = ['name'];


    protected string $label = 'فترة تقييم';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'      => [$record ? 'sometimes' : 'required', 'string', 'max:160'],
            'from_date' => ['nullable', 'date'],
            'to_date'   => ['nullable', 'date', 'after_or_equal:from_date'],
            'status'    => ['nullable', 'in:open,closed'],
        ];
    }

    protected function transformAll($rows)
    {
        $counts = Evaluation::selectRaw('period_id, COUNT(*) c')->groupBy('period_id')->pluck('c', 'period_id');

        return $rows->map(function ($p) use ($counts) {
            $p->evaluations_count = (int) ($counts[$p->id] ?? 0);

            return $p;
        });
    }

    protected function cannotDelete(Model $record): ?string
    {
        return Evaluation::where('period_id', $record->id)->exists() ? 'لا يمكن حذف فترة تحتوي تقييمات.' : null;
    }
}

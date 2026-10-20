<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Api\ResourceController;
use App\Models\ExpenseCategory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class ExpenseCategoryController extends ResourceController
{
    protected string $model = ExpenseCategory::class;

    protected array $search = ['name'];

    protected array $withCount = ['expenses'];

    protected string $dir = 'asc';

    protected string $label = 'فئة مصاريف';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'  => [$record ? 'sometimes' : 'required', 'string', 'max:120'],
            'color' => ['nullable', 'string', 'max:10'],
        ];
    }

    protected function transformAll($rows)
    {
        $sum = \App\Models\Expense::selectRaw('expense_category_id, SUM(total) s')->groupBy('expense_category_id')->pluck('s', 'expense_category_id');

        return $rows->map(function ($c) use ($sum) {
            $c->expenses_total = round((float) ($sum[$c->id] ?? 0), 3);

            return $c;
        });
    }

    protected function cannotDelete(Model $record): ?string
    {
        return $record->expenses()->exists() ? 'لا يمكن حذف فئة مستخدمة في مصروفات.' : null;
    }
}

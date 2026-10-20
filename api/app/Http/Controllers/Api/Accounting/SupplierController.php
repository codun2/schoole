<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Api\ResourceController;
use App\Models\Supplier;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class SupplierController extends ResourceController
{
    protected string $model = Supplier::class;

    protected array $search = ['name', 'contact_person', 'phone', 'email', 'tax_number'];

    protected array $withCount = ['expenses'];

    protected string $label = 'مورد';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'           => [$record ? 'sometimes' : 'required', 'string', 'max:255'],
            'contact_person' => ['nullable', 'string', 'max:120'],
            'phone'          => ['nullable', 'string', 'max:40'],
            'email'          => ['nullable', 'email'],
            'tax_number'     => ['nullable', 'string', 'max:60'],
            'address'        => ['nullable', 'string', 'max:255'],
            'notes'          => ['nullable', 'string'],
        ];
    }

    protected function transformAll($rows)
    {
        $due = \App\Models\Expense::whereIn('supplier_id', $rows->pluck('id'))
            ->selectRaw('supplier_id, SUM(total - paid) d')->groupBy('supplier_id')->pluck('d', 'supplier_id');

        return $rows->map(function ($s) use ($due) {
            $s->balance_due = round((float) ($due[$s->id] ?? 0), 3);

            return $s;
        });
    }

    protected function cannotDelete(Model $record): ?string
    {
        return $record->expenses()->exists() ? 'لا يمكن حذف مورد له فواتير مصروفات.' : null;
    }
}

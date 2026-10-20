<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Api\ResourceController;
use App\Models\Customer;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class CustomerController extends ResourceController
{
    protected string $model = Customer::class;

    protected array $search = ['name', 'phone', 'email', 'tax_number'];

    protected array $withCount = ['invoices'];

    protected string $label = 'عميل';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'       => [$record ? 'sometimes' : 'required', 'string', 'max:255'],
            'phone'      => ['nullable', 'string', 'max:40'],
            'email'      => ['nullable', 'email'],
            'tax_number' => ['nullable', 'string', 'max:60'],
            'address'    => ['nullable', 'string', 'max:255'],
            'notes'      => ['nullable', 'string'],
        ];
    }

    protected function transformAll($rows)
    {
        $due = \App\Models\ServiceInvoice::whereIn('customer_id', $rows->pluck('id'))->whereNotIn('status', ['cancelled', 'draft'])
            ->selectRaw('customer_id, SUM(total - paid) d')->groupBy('customer_id')->pluck('d', 'customer_id');

        return $rows->map(function ($c) use ($due) {
            $c->balance_due = round((float) ($due[$c->id] ?? 0), 3);

            return $c;
        });
    }

    protected function cannotDelete(Model $record): ?string
    {
        return $record->invoices()->exists() ? 'لا يمكن حذف عميل له فواتير.' : null;
    }
}

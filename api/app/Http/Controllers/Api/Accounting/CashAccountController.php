<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Api\ResourceController;
use App\Models\CashAccount;
use App\Models\Voucher;
use App\Support\Finance;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/** Cash boxes and bank accounts (also serve as payment methods), with live balances. */
class CashAccountController extends ResourceController
{
    protected string $model = CashAccount::class;

    protected array $search = ['name', 'bank_name', 'account_no', 'iban'];

    protected array $filters = ['type'];

    protected string $order = 'id';

    protected string $dir = 'asc';

    protected string $label = 'حساب نقدية';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'            => [$record ? 'sometimes' : 'required', 'string', 'max:120'],
            'type'            => ['nullable', 'in:cash,bank'],
            'bank_name'       => ['nullable', 'string', 'max:120'],
            'account_no'      => ['nullable', 'string', 'max:60'],
            'iban'            => ['nullable', 'string', 'max:60'],
            'opening_balance' => ['nullable', 'numeric'],
            'is_active'       => ['boolean'],
        ];
    }

    protected function transformAll($rows)
    {
        $bal = collect(Finance::balances())->keyBy('id');

        return $rows->map(function ($a) use ($bal) {
            $b = $bal[$a->id] ?? null;
            $a->total_in = $b->total_in ?? 0;
            $a->total_out = $b->total_out ?? 0;
            $a->balance = $b->balance ?? (float) $a->opening_balance;

            return $a;
        });
    }

    protected function cannotDelete(Model $record): ?string
    {
        return Voucher::where('cash_account_id', $record->id)->exists() ? 'لا يمكن حذف حساب عليه حركات — يمكنك تعطيله.' : null;
    }
}

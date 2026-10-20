<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Api\ResourceController;
use App\Http\Controllers\Concerns\HandlesUploads;
use App\Models\Expense;
use App\Models\Voucher;
use App\Support\Activity;
use App\Support\Finance;
use App\Support\Numbering;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/** Expense bills (فواتير المصروفات) and their payments (payment vouchers). */
class ExpenseController extends ResourceController
{
    use HandlesUploads;

    protected string $model = Expense::class;

    protected array $search = ['number', 'description', 'supplier.name'];

    protected array $filters = ['status', 'expense_category_id', 'supplier_id', 'branch_id'];

    protected array $with = ['category:id,name,color', 'supplier:id,name'];

    protected array $showWith = ['payments'];

    protected array $sortable = ['id', 'date', 'total'];

    protected ?string $dateColumn = 'date';

    protected string $label = 'مصروف';

    protected function rules(Request $request, ?Model $record): array
    {
        $req = $record ? 'sometimes' : 'required';

        return [
            'expense_category_id' => ['nullable', 'integer', $this->owned('expense_categories')],
            'supplier_id'         => ['nullable', 'integer', $this->owned('suppliers')],
            'branch_id'           => ['nullable', 'integer', $this->owned('branches')],
            'date'                => [$req, 'date'],
            'description'         => [$req, 'string', 'max:255'],
            'amount'              => [$req, 'numeric', 'min:0'],
            'tax'                 => ['nullable', 'numeric', 'min:0'],
            'pay_now'             => ['boolean'],
            'cash_account_id'     => ['nullable', 'integer', $this->owned('cash_accounts')],
            'method'              => ['nullable', 'in:cash,bank,card,cheque'],
            'file'                => ['nullable', 'file', 'max:8192'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        $amount = (float) ($data['amount'] ?? $record?->amount ?? 0);
        $tax = (float) ($data['tax'] ?? $record?->tax ?? 0);
        $data['total'] = Finance::r($amount + $tax);
        if (! $record) {
            $data['number'] = Numbering::next(Expense::class, 'EXP-');
        }
        if ($request->hasFile('file')) {
            $data['attachment'] = $this->storeImage($request->file('file'), 'expenses');
        }

        return collect($data)->except(['pay_now', 'cash_account_id', 'method', 'file'])->all();
    }

    protected function afterSave(Model $record, Request $request, bool $created): void
    {
        if ($created && $request->boolean('pay_now') && (float) $record->total > 0) {
            $this->recordPayment($record, ['amount' => $record->total, 'cash_account_id' => $request->cash_account_id, 'method' => $request->input('method', 'cash'), 'date' => $record->date->toDateString()]);
        }
        Finance::syncExpense($record);
    }

    public function pay(Request $request, $id)
    {
        $e = $this->find($id);
        $data = $request->validate([
            'amount'          => ['required', 'numeric', 'min:0.001'],
            'date'            => ['nullable', 'date'],
            'method'          => ['nullable', 'in:cash,bank,card,cheque'],
            'cash_account_id' => ['nullable', 'integer', $this->owned('cash_accounts')],
            'reference'       => ['nullable', 'string', 'max:120'],
        ]);
        if ((float) $data['amount'] > (float) $e->total - (float) $e->paid + 0.0005) {
            return response()->json(['message' => 'المبلغ أكبر من المتبقي على الفاتورة.'], 422);
        }
        $v = $this->recordPayment($e, $data);
        Finance::syncExpense($e);

        return response()->json(['message' => 'تم تسجيل الدفع — سند صرف '.$v->number, 'voucher' => $v], 201);
    }

    private function recordPayment(Expense $e, array $data): Voucher
    {
        $e->loadMissing('supplier', 'category');
        $v = Finance::voucher('payment', [
            'date'            => $data['date'] ?? now()->toDateString(),
            'amount'          => Finance::r((float) $data['amount']),
            'cash_account_id' => $data['cash_account_id'] ?? null,
            'method'          => $data['method'] ?? 'cash',
            'reference'       => $data['reference'] ?? null,
            'category'        => 'expense',
            'party_type'      => $e->supplier_id ? 'supplier' : 'other',
            'party_id'        => $e->supplier_id,
            'party_name'      => $e->supplier?->name,
            'source_type'     => 'expense',
            'source_id'       => $e->id,
            'description'     => 'سداد مصروف '.$e->number.' — '.$e->description,
        ]);
        Activity::log('payment', $e, 'سند صرف '.$v->number.' لمصروف '.$e->number);

        return $v;
    }

    protected function beforeDelete(Model $record): void
    {
        Voucher::where('source_type', 'expense')->where('source_id', $record->id)->delete();
        $this->deleteImage($record->attachment);
    }
}

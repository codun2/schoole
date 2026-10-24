<?php

namespace App\Support;

use App\Models\CashAccount;
use App\Models\Contract;
use App\Models\Expense;
use App\Models\Installment;
use App\Models\ServiceInvoice;
use App\Models\Voucher;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * All money rules live here so every screen agrees:
 *  - contract totals (subtotal → discount → tax → total) and installment schedule,
 *  - receiving a tuition payment (voucher + spread over installments oldest-first),
 *  - paying expenses / collecting service invoices,
 *  - cash account balances.
 */
class Finance
{
    public static function r(float $v): float
    {
        return round($v, 3);
    }

    /** Recompute a contract's money columns from its items. */
    public static function computeContract(Contract $c, array $items): void
    {
        $subtotal = self::r(array_sum(array_map(fn ($i) => (float) $i['amount'], $items)));
        $discount = $c->discount_type === 'percent'
            ? self::r($subtotal * min(100, (float) $c->discount_value) / 100)
            : min($subtotal, self::r((float) $c->discount_value));
        $taxable = $subtotal - $discount;
        $tax = self::r($taxable * (float) $c->tax_rate / 100);

        $c->subtotal = $subtotal;
        $c->discount = $discount;
        $c->tax = $tax;
        $c->total = self::r($taxable + $tax);
        $c->remaining = self::r(max(0, $c->total - (float) $c->paid));
    }

    /**
     * (Re)build the installment schedule: equal monthly parts starting at
     * first_due_date, the last part absorbing rounding. Only for unpaid contracts.
     */
    public static function buildInstallments(Contract $c): void
    {
        if ((float) $c->paid > 0) {
            return; // never reshuffle a schedule that already has money on it
        }
        $c->installments()->get()->each->delete(); // per-model so offline mirrors get tombstones

        $rows = [];
        $custom = is_array($c->schedule) ? array_values($c->schedule) : [];
        if (count($custom)) {
            // dates/amounts edited in the builder; the last row absorbs any rounding so the sum equals the total
            $sumBut = 0;
            foreach ($custom as $i => $x) {
                $amount = $i === count($custom) - 1 ? self::r((float) $c->total - $sumBut) : self::r((float) ($x['amount'] ?? 0));
                $sumBut += $amount;
                $rows[] = ['due_date' => Carbon::parse($x['due_date'])->toDateString(), 'amount' => max(0, $amount)];
            }
        } else {
            $n = max(1, (int) $c->installments_count);
            $start = Carbon::parse($c->first_due_date ?: $c->date);
            $part = floor(((float) $c->total / $n) * 1000) / 1000;
            for ($i = 1; $i <= $n; $i++) {
                $rows[] = ['due_date' => $start->copy()->addMonthsNoOverflow($i - 1)->toDateString(), 'amount' => $i === $n ? self::r((float) $c->total - $part * ($n - 1)) : $part];
            }
        }
        foreach ($rows as $i => $r) {
            Installment::create([
                'contract_id' => $c->id,
                'student_id'  => $c->student_id,
                'seq'         => $i + 1,
                'due_date'    => $r['due_date'],
                'amount'      => $r['amount'],
                'paid'        => 0,
                'status'      => 'pending',
            ]);
        }
    }

    /** Re-sync paid/remaining/status of a contract from its tuition vouchers. */
    public static function syncContract(Contract $c): void
    {
        $paid = (float) Voucher::where('source_type', 'contract')->where('source_id', $c->id)->where('type', 'receipt')->sum('amount');
        $c->paid = self::r($paid);
        $c->remaining = self::r(max(0, (float) $c->total - $paid));
        if ($c->status !== 'cancelled' && $c->status !== 'draft') {
            $c->status = $c->remaining <= 0 ? 'completed' : 'active';
        }
        $c->save();

        // Spread the paid amount over installments oldest-first.
        $left = $paid;
        foreach ($c->installments()->orderBy('seq')->get() as $inst) {
            $take = min($left, (float) $inst->amount);
            $left = self::r($left - $take);
            $inst->paid = self::r($take);
            $inst->status = $take <= 0 ? 'pending' : ($take + 0.0005 >= (float) $inst->amount ? 'paid' : 'partial');
            $inst->save();
        }
    }

    /** Receive a tuition payment against a contract. Returns the receipt voucher. */
    public static function payContract(Contract $c, array $data): Voucher
    {
        if (! in_array($c->status, ['active'], true)) {
            throw ValidationException::withMessages(['amount' => ['لا يمكن الدفع إلا على عقد مفعّل.']]);
        }
        $amount = self::r((float) $data['amount']);
        if ($amount <= 0 || $amount > (float) $c->remaining + 0.0005) {
            throw ValidationException::withMessages(['amount' => ['المبلغ يجب أن يكون أكبر من صفر ولا يتجاوز المتبقي ('.number_format((float) $c->remaining, 3).').']]);
        }

        return DB::transaction(function () use ($c, $data, $amount) {
            $c->loadMissing('student', 'guardian');
            $installment = Installment::where('contract_id', $c->id)->where('status', '!=', 'paid')->orderBy('seq')->first();
            $v = self::voucher('receipt', [
                'date'            => $data['date'] ?? now()->toDateString(),
                'amount'          => $amount,
                'cash_account_id' => $data['cash_account_id'] ?? null,
                'method'          => $data['method'] ?? 'cash',
                'reference'       => $data['reference'] ?? null,
                'category'        => 'tuition',
                'party_type'      => 'guardian',
                'party_id'        => $c->guardian_id,
                'party_name'      => $c->guardian?->name,
                'source_type'     => 'contract',
                'source_id'       => $c->id,
                'installment_id'  => $installment?->id,
                'description'     => $data['description'] ?? ('دفعة رسوم دراسية — '.$c->student?->name.' — عقد '.$c->number),
            ]);
            self::syncContract($c);

            return $v;
        });
    }

    /** Create a voucher with the next number of its type. */
    public static function voucher(string $type, array $data): Voucher
    {
        $prefix = $type === 'receipt' ? 'RC-' : 'PV-';
        $data['cash_account_id'] = $data['cash_account_id'] ?? CashAccount::where('type', 'cash')->value('id');

        return Voucher::create($data + [
            'type'       => $type,
            'number'     => Numbering::next(Voucher::class, $prefix, 6, 'number', ['type' => $type]),
            'created_by' => auth()->id(),
        ]);
    }

    public static function syncInvoice(ServiceInvoice $inv): void
    {
        $paid = (float) Voucher::where('source_type', 'service_invoice')->where('source_id', $inv->id)->sum('amount');
        $inv->paid = self::r($paid);
        if ($inv->status !== 'cancelled' && $inv->status !== 'draft') {
            $inv->status = $paid <= 0 ? 'issued' : ($paid + 0.0005 >= (float) $inv->total ? 'paid' : 'partial');
        }
        $inv->save();
    }

    public static function syncExpense(Expense $e): void
    {
        $paid = (float) Voucher::where('source_type', 'expense')->where('source_id', $e->id)->sum('amount');
        $e->paid = self::r($paid);
        $e->status = $paid <= 0 ? 'unpaid' : ($paid + 0.0005 >= (float) $e->total ? 'paid' : 'partial');
        $e->save();
    }

    /** Balance of every cash/bank account: opening + receipts − payments. */
    public static function balances(): array
    {
        $in = Voucher::where('type', 'receipt')->selectRaw('cash_account_id, SUM(amount) s')->groupBy('cash_account_id')->pluck('s', 'cash_account_id');
        $out = Voucher::where('type', 'payment')->selectRaw('cash_account_id, SUM(amount) s')->groupBy('cash_account_id')->pluck('s', 'cash_account_id');

        return CashAccount::orderBy('id')->get()->map(function ($a) use ($in, $out) {
            $a->total_in = self::r((float) ($in[$a->id] ?? 0));
            $a->total_out = self::r((float) ($out[$a->id] ?? 0));
            $a->balance = self::r((float) $a->opening_balance + $a->total_in - $a->total_out);

            return $a;
        })->all();
    }
}

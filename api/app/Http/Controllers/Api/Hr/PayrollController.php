<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeAdjustment;
use App\Models\EmployeeAdvance;
use App\Models\EmployeeAttendance;
use App\Models\Payroll;
use App\Models\PayrollItem;
use App\Models\Voucher;
use App\Support\Activity;
use App\Support\Finance;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Monthly payroll run: draft (editable / regenerable) → approved (adjustments
 * and advance deductions locked in) → paid (one salary payment voucher).
 * Unexcused absence days are deducted at (basic / 30) per day.
 */
class PayrollController extends Controller
{
    public function index()
    {
        return response()->json(['data' => Payroll::orderByDesc('month')->get()]);
    }

    public function show($id)
    {
        $p = Payroll::findOrFail($id);
        $p->load(['items.employee:id,name,number,department_id,iban,bank_name', 'items.employee.department:id,name']);

        return response()->json($p);
    }

    public function generate(Request $request)
    {
        $month = $request->validate(['month' => ['required', 'date_format:Y-m']])['month'];
        $p = Payroll::where('month', $month)->first();
        if ($p && $p->status !== 'draft') {
            return response()->json(['message' => 'مسيّر هذا الشهر معتمد بالفعل.'], 422);
        }

        $p = DB::transaction(function () use ($p, $month) {
            $p = $p ?: Payroll::create(['month' => $month, 'status' => 'draft']);
            $p->items()->delete();

            $employees = Employee::whereIn('status', ['active', 'on_leave'])->where(fn ($q) => $q->whereNull('hire_date')->orWhere('hire_date', '<=', $month.'-31'))->get();
            $adj = EmployeeAdjustment::where('month', $month)->whereNull('payroll_id')->get()->groupBy('employee_id');
            $absences = EmployeeAttendance::where('date', 'like', $month.'%')->where('status', 'absent')
                ->selectRaw('employee_id, COUNT(*) c')->groupBy('employee_id')->pluck('c', 'employee_id');
            $advances = EmployeeAdvance::where('status', 'active')->get()->groupBy('employee_id');

            $t = ['basic' => 0, 'allow' => 0, 'bonus' => 0, 'ded' => 0, 'net' => 0];
            foreach ($employees as $e) {
                $mine = $adj[$e->id] ?? collect();
                $bonuses = (float) $mine->where('type', 'bonus')->sum('amount');
                $deductions = (float) $mine->where('type', 'deduction')->sum('amount');
                $absence = Finance::r((float) $e->basic_salary / 30 * (int) ($absences[$e->id] ?? 0));
                $advance = 0;
                foreach ($advances[$e->id] ?? [] as $a) {
                    $advance += min((float) $a->monthly_deduction, (float) $a->remaining);
                }
                $allow = $e->allowances();
                $net = Finance::r(max(0, (float) $e->basic_salary + $allow + $bonuses - $deductions - $absence - $advance));

                PayrollItem::create([
                    'payroll_id'        => $p->id,
                    'employee_id'       => $e->id,
                    'basic'             => $e->basic_salary,
                    'allowances'        => Finance::r($allow),
                    'bonuses'           => Finance::r($bonuses),
                    'deductions'        => Finance::r($deductions + $absence),
                    'advance_deduction' => Finance::r($advance),
                    'net'               => $net,
                ]);
                $t['basic'] += (float) $e->basic_salary;
                $t['allow'] += $allow;
                $t['bonus'] += $bonuses;
                $t['ded'] += $deductions + $absence + $advance;
                $t['net'] += $net;
            }

            $p->update([
                'employees_count'  => $employees->count(),
                'total_basic'      => Finance::r($t['basic']),
                'total_allowances' => Finance::r($t['allow']),
                'total_bonuses'    => Finance::r($t['bonus']),
                'total_deductions' => Finance::r($t['ded']),
                'net_total'        => Finance::r($t['net']),
            ]);

            return $p;
        });
        Activity::log('generate', $p, 'توليد مسيّر رواتب '.$month);

        return response()->json($p->fresh());
    }

    public function approve(Request $request, $id)
    {
        $p = Payroll::findOrFail($id);
        if ($p->status !== 'draft') {
            return response()->json(['message' => 'المسيّر معتمد مسبقاً.'], 422);
        }
        DB::transaction(function () use ($p) {
            EmployeeAdjustment::where('month', $p->month)->whereNull('payroll_id')->update(['payroll_id' => $p->id]);
            foreach ($p->items as $item) {
                $left = (float) $item->advance_deduction;
                foreach (EmployeeAdvance::where('employee_id', $item->employee_id)->where('status', 'active')->orderBy('date')->get() as $a) {
                    if ($left <= 0) {
                        break;
                    }
                    $take = min($left, (float) $a->monthly_deduction, (float) $a->remaining);
                    $a->remaining = Finance::r((float) $a->remaining - $take);
                    $a->status = $a->remaining <= 0 ? 'settled' : 'active';
                    $a->save();
                    $left -= $take;
                }
            }
            $p->update(['status' => 'approved', 'approved_at' => now()]);
        });
        Activity::log('approve', $p, 'اعتماد مسيّر رواتب '.$p->month);

        return response()->json(['message' => 'تم اعتماد مسيّر الرواتب.']);
    }

    public function pay(Request $request, $id)
    {
        $p = Payroll::findOrFail($id);
        $data = $request->validate(['cash_account_id' => ['nullable', 'integer', $this->owned('cash_accounts')], 'date' => ['nullable', 'date']]);
        if ($p->status !== 'approved') {
            return response()->json(['message' => 'يجب اعتماد المسيّر قبل صرفه.'], 422);
        }
        $v = Finance::voucher('payment', [
            'date'            => $data['date'] ?? now()->toDateString(),
            'amount'          => $p->net_total,
            'cash_account_id' => $data['cash_account_id'] ?? \App\Models\CashAccount::where('type', 'bank')->value('id'),
            'method'          => 'bank',
            'category'        => 'salary',
            'party_type'      => 'employee',
            'party_name'      => 'رواتب الموظفين',
            'source_type'     => 'payroll',
            'source_id'       => $p->id,
            'description'     => 'صرف رواتب شهر '.$p->month.' ('.$p->employees_count.' موظف)',
        ]);
        $p->update(['status' => 'paid', 'paid_at' => now(), 'voucher_id' => $v->id]);
        Activity::log('pay', $p, 'صرف رواتب '.$p->month);

        return response()->json(['message' => 'تم صرف الرواتب — سند صرف '.$v->number]);
    }

    public function destroy($id)
    {
        $p = Payroll::findOrFail($id);
        if ($p->status !== 'draft') {
            return response()->json(['message' => 'لا يمكن حذف مسيّر معتمد.'], 422);
        }
        $p->delete();

        return response()->json(['message' => 'تم حذف المسيّر.']);
    }
}

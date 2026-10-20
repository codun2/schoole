<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\Application;
use App\Models\Contract;
use App\Models\Correspondence;
use App\Models\Employee;
use App\Models\EmployeeAttendance;
use App\Models\Expense;
use App\Models\Installment;
use App\Models\LeaveRequest;
use App\Models\License;
use App\Models\Payroll;
use App\Models\Section;
use App\Models\ServiceInvoice;
use App\Models\Student;
use App\Models\Subject;
use App\Models\GradeMark;
use App\Models\ExamTerm;
use App\Models\StudentAttendance;
use App\Models\Task;
use App\Models\Voucher;
use App\Support\Finance;
use Carbon\Carbon;
use Illuminate\Http\Request;

/** Every dashboard in the app, computed live from the operational data. */
class DashboardController extends Controller
{
    /**
     * Revenue (accrual) = activated contracts + issued service invoices dated in the period.
     * Expenses = expense bills + approved/paid payroll of the period.
     * Receipts (cash) = receipt vouchers in the period.
     */
    private function periodFigures(Carbon $from, Carbon $to): array
    {
        $f = $from->toDateString();
        $t = $to->toDateString();
        $revenue = (float) Contract::whereIn('status', ['active', 'completed'])->whereBetween('date', [$f, $t])->sum('total')
            + (float) ServiceInvoice::whereNotIn('status', ['draft', 'cancelled'])->whereBetween('date', [$f, $t])->sum('total');
        $months = [];
        for ($m = $from->copy()->startOfMonth(); $m <= $to; $m->addMonth()) {
            $months[] = $m->format('Y-m');
        }
        $expenses = (float) Expense::whereBetween('date', [$f, $t])->sum('total')
            + (float) Payroll::whereIn('status', ['approved', 'paid'])->whereIn('month', $months)->sum('net_total');
        $receipts = (float) Voucher::where('type', 'receipt')->whereBetween('date', [$f, $t])->sum('amount');

        return ['revenue' => Finance::r($revenue), 'expenses' => Finance::r($expenses), 'profit' => Finance::r($revenue - $expenses), 'receipts' => Finance::r($receipts)];
    }

    private static function change(float $now, float $before): ?float
    {
        if ($before == 0.0) {
            return $now == 0.0 ? 0.0 : null;
        }

        return round(($now - $before) * 100 / abs($before), 1);
    }

    public function main(Request $request)
    {
        $period = $request->period === 'year' ? 'year' : 'month';
        $now = now();
        [$from, $to, $pFrom, $pTo] = $period === 'year'
            ? [$now->copy()->startOfYear(), $now->copy()->endOfYear(), $now->copy()->subYear()->startOfYear(), $now->copy()->subYear()->endOfYear()]
            : [$now->copy()->startOfMonth(), $now->copy()->endOfMonth(), $now->copy()->subMonthNoOverflow()->startOfMonth(), $now->copy()->subMonthNoOverflow()->endOfMonth()];

        $cur = $this->periodFigures($from, $to);
        $prev = $this->periodFigures($pFrom, $pTo);

        $outstanding = (float) Contract::where('status', 'active')->sum('remaining')
            + (float) ServiceInvoice::whereIn('status', ['issued', 'partial'])->selectRaw('SUM(total - paid) s')->value('s');

        $chart = [];
        for ($i = 5; $i >= 0; $i--) {
            $m = $now->copy()->startOfMonth()->subMonthsNoOverflow($i);
            $fig = $this->periodFigures($m->copy(), $m->copy()->endOfMonth());
            $chart[] = ['month' => $m->format('Y-m'), 'revenue' => $fig['revenue'], 'expenses' => $fig['expenses'], 'receipts' => $fig['receipts']];
        }

        return response()->json([
            'period'      => $period,
            'revenue'     => ['value' => $cur['revenue'], 'change' => self::change($cur['revenue'], $prev['revenue'])],
            'expenses'    => ['value' => $cur['expenses'], 'change' => self::change($cur['expenses'], $prev['expenses'])],
            'profit'      => ['value' => $cur['profit'], 'change' => self::change($cur['profit'], $prev['profit'])],
            'receipts'    => ['value' => $cur['receipts'], 'change' => self::change($cur['receipts'], $prev['receipts'])],
            'outstanding' => Finance::r($outstanding),
            'chart'       => $chart,
            'counts'      => [
                'students'  => Student::where('status', 'active')->count(),
                'employees' => Employee::where('status', 'active')->count(),
                'tasks_open' => Task::whereIn('status', ['new', 'in_progress'])->count(),
                'overdue_installments' => Installment::where('status', '!=', 'paid')->whereDate('due_date', '<', $now->toDateString())
                    ->whereHas('contract', fn ($c) => $c->where('status', 'active'))->count(),
            ],
        ]);
    }

    public function school(Request $request)
    {
        $yearId = $request->year && $request->year !== 'all' ? (int) $request->year : $request->user()->company->currentYearId();
        $today = now()->toDateString();
        $contracts = Contract::where('academic_year_id', $yearId)->whereIn('status', ['active', 'completed']);
        $attToday = StudentAttendance::where('academic_year_id', $yearId)->whereDate('date', $today);

        $byGrade = Student::where('students.academic_year_id', $yearId)->where('students.status', 'active')
            ->join('grades', 'grades.id', '=', 'students.grade_id')
            ->selectRaw('grades.name_ar name, grades.sort, COUNT(*) c')->groupBy('grades.id', 'grades.name_ar', 'grades.sort')->orderBy('grades.sort')->get();

        return response()->json([
            'students_active'    => Student::where('academic_year_id', $yearId)->where('status', 'active')->count(),
            'students_pending'   => Student::where('academic_year_id', $yearId)->where('status', 'pending')->count(),
            'students_total'     => Student::where('academic_year_id', $yearId)->count(),
            'applications_new'   => Application::where('academic_year_id', $yearId)->where('status', 'new')->count(),
            'attendance_today'   => [
                'present' => (clone $attToday)->whereIn('status', ['present', 'late'])->count(),
                'total'   => (clone $attToday)->count(),
            ],
            'sections_count'     => Section::where('academic_year_id', $yearId)->count(),
            'subjects_count'     => Subject::where('academic_year_id', $yearId)->count(),
            'terms_count'        => ExamTerm::where('academic_year_id', $yearId)->count(),
            'marks_count'        => GradeMark::where('academic_year_id', $yearId)->whereNotNull('mark')->count(),
            'contracts_active'   => Contract::where('academic_year_id', $yearId)->where('status', 'active')->count(),
            'contracts_draft'    => Contract::where('academic_year_id', $yearId)->where('status', 'draft')->count(),
            'contracts_total'    => Finance::r((float) (clone $contracts)->sum('total')),
            'collected'          => Finance::r((float) (clone $contracts)->sum('paid')),
            'remaining'          => Finance::r((float) (clone $contracts)->sum('remaining')),
            'overdue'            => Finance::r((float) Installment::whereHas('contract', fn ($c) => $c->where('academic_year_id', $yearId)->where('status', 'active'))
                ->where('status', '!=', 'paid')->whereDate('due_date', '<', $today)->selectRaw('SUM(amount - paid) s')->value('s')),
            'by_grade'           => $byGrade,
            'gender'             => Student::where('academic_year_id', $yearId)->where('status', 'active')->selectRaw('gender, COUNT(*) c')->groupBy('gender')->pluck('c', 'gender'),
            'recent_contracts'   => Contract::with(['student:id,name', 'grade:id,name_ar', 'section:id,name'])->where('academic_year_id', $yearId)->orderByDesc('id')->limit(6)->get(),
            'pending_students'   => Student::with(['grade:id,name_ar', 'guardian:id,name,phone'])->where('academic_year_id', $yearId)->where('status', 'pending')->orderByDesc('id')->limit(6)->get(),
            'upcoming_installments' => Installment::with(['student:id,name', 'contract:id,number'])->whereHas('contract', fn ($c) => $c->where('academic_year_id', $yearId)->where('status', 'active'))
                ->where('status', '!=', 'paid')->orderBy('due_date')->limit(6)->get(),
        ]);
    }

    public function hr(Request $request)
    {
        $today = now()->toDateString();
        $att = EmployeeAttendance::whereDate('date', $today)->selectRaw('status, COUNT(*) c')->groupBy('status')->pluck('c', 'status');

        return response()->json([
            'employees_active' => Employee::where('status', 'active')->count(),
            'employees_total'  => Employee::where('status', '!=', 'terminated')->count(),
            'teachers'         => Employee::where('status', '!=', 'terminated')->where('is_teacher', true)->count(),
            'on_leave_today'   => LeaveRequest::where('status', 'approved')->whereDate('from_date', '<=', $today)->whereDate('to_date', '>=', $today)->count(),
            'pending_leaves'   => LeaveRequest::where('status', 'pending')->count(),
            'attendance_today' => $att,
            'salaries_total'   => Finance::r((float) Employee::where('status', 'active')->selectRaw('SUM(basic_salary + housing_allowance + transport_allowance + other_allowance) s')->value('s')),
            'by_department'    => Employee::where('employees.status', '!=', 'terminated')->leftJoin('departments', 'departments.id', '=', 'employees.department_id')
                ->selectRaw("COALESCE(departments.name, 'بدون قسم') name, COUNT(*) c")->groupBy('departments.name')->orderByDesc('c')->get(),
            'last_payroll'     => Payroll::orderByDesc('month')->first(),
            'leave_requests'   => LeaveRequest::with(['employee:id,name', 'leaveType:id,name'])->where('status', 'pending')->orderBy('from_date')->limit(6)->get(),
            'new_hires'        => Employee::with('jobTitle:id,name')->orderByDesc('hire_date')->limit(5)->get(['id', 'name', 'number', 'hire_date', 'job_title_id']),
        ]);
    }

    public function admin(Request $request)
    {
        $today = now()->toDateString();

        return response()->json([
            'tasks'            => Task::selectRaw('status, COUNT(*) c')->groupBy('status')->pluck('c', 'status'),
            'tasks_overdue'    => Task::whereNotIn('status', ['done', 'cancelled'])->whereDate('end_date', '<', $today)->count(),
            'my_tasks'         => Task::where('assigned_to', $request->user()->id)->whereNotIn('status', ['done', 'cancelled'])->orderBy('end_date')->limit(6)->get(),
            'correspondence'   => Correspondence::selectRaw('direction, COUNT(*) c')->groupBy('direction')->pluck('c', 'direction'),
            'correspondence_open' => Correspondence::where('status', '!=', 'closed')->count(),
            'licenses_expiring' => License::whereNotNull('expiry_date')->whereDate('expiry_date', '<=', now()->addDays(30)->toDateString())->orderBy('expiry_date')->get(),
            'upcoming_tasks'   => Task::with('assignee:id,name')->whereNotIn('status', ['done', 'cancelled'])->orderBy('end_date')->limit(8)->get(),
        ]);
    }

    public function accounting(Request $request)
    {
        $from = now()->startOfMonth()->toDateString();
        $to = now()->endOfMonth()->toDateString();

        return response()->json([
            'balances'         => Finance::balances(),
            'month_receipts'   => Finance::r((float) Voucher::where('type', 'receipt')->whereBetween('date', [$from, $to])->sum('amount')),
            'month_payments'   => Finance::r((float) Voucher::where('type', 'payment')->whereBetween('date', [$from, $to])->sum('amount')),
            'unpaid_expenses'  => Finance::r((float) Expense::where('status', '!=', 'paid')->selectRaw('SUM(total - paid) s')->value('s')),
            'unpaid_invoices'  => Finance::r((float) ServiceInvoice::whereIn('status', ['issued', 'partial'])->selectRaw('SUM(total - paid) s')->value('s')),
            'tuition_due'      => Finance::r((float) Contract::where('status', 'active')->sum('remaining')),
            'by_category'      => Expense::whereBetween('date', [now()->startOfYear()->toDateString(), now()->endOfYear()->toDateString()])
                ->leftJoin('expense_categories', 'expense_categories.id', '=', 'expenses.expense_category_id')
                ->selectRaw("COALESCE(expense_categories.name, 'غير مصنّف') name, COALESCE(expense_categories.color, '#94a3b8') color, SUM(expenses.total) total")
                ->groupBy('expense_categories.name', 'expense_categories.color')->orderByDesc('total')->get(),
            'recent_vouchers'  => Voucher::orderByDesc('id')->limit(8)->get(),
        ]);
    }

    /** Financial reports: income statement by month, receipts by category, guardian debts. */
    public function reports(Request $request)
    {
        $data = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date']]);
        $from = Carbon::parse($data['from'] ?? now()->startOfYear());
        $to = Carbon::parse($data['to'] ?? now()->endOfYear());

        $monthly = [];
        for ($m = $from->copy()->startOfMonth(); $m <= $to; $m->addMonth()) {
            $monthly[] = ['month' => $m->format('Y-m')] + $this->periodFigures($m->copy(), $m->copy()->endOfMonth());
        }
        $f = $from->toDateString();
        $t = $to->toDateString();

        return response()->json([
            'from'        => $f,
            'to'          => $t,
            'totals'      => $this->periodFigures($from, $to),
            'monthly'     => $monthly,
            'receipts_by_category' => Voucher::where('type', 'receipt')->whereBetween('date', [$f, $t])->selectRaw('category, SUM(amount) total, COUNT(*) n')->groupBy('category')->get(),
            'payments_by_category' => Voucher::where('type', 'payment')->whereBetween('date', [$f, $t])->selectRaw('category, SUM(amount) total, COUNT(*) n')->groupBy('category')->get(),
            'debts'       => Contract::with(['guardian:id,name,phone'])->where('status', 'active')->where('remaining', '>', 0)
                ->selectRaw('guardian_id, COUNT(*) contracts, SUM(total) total, SUM(paid) paid, SUM(remaining) remaining')
                ->groupBy('guardian_id')->orderByDesc('remaining')->limit(100)->get(),
            'by_grade'    => Contract::whereIn('contracts.status', ['active', 'completed'])->join('grades', 'grades.id', '=', 'contracts.grade_id')
                ->selectRaw('grades.name_ar name, COUNT(*) contracts, SUM(contracts.total) total, SUM(contracts.paid) paid, SUM(contracts.remaining) remaining')
                ->groupBy('grades.id', 'grades.name_ar')->get(),
        ]);
    }
}

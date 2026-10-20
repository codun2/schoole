<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Api\ResourceController;
use App\Models\Employee;
use App\Models\EmployeeAdvance;
use App\Models\EmployeeAttendance;
use App\Models\LeaveRequest;
use App\Models\EmployeeContract;
use App\Models\Evaluation;
use App\Models\PayrollItem;
use App\Support\Numbering;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class EmployeeController extends ResourceController
{
    protected string $model = Employee::class;

    protected array $search = ['name', 'number', 'national_id', 'phone', 'email'];

    protected array $filters = ['status', 'department_id', 'branch_id', 'job_title_id', 'is_teacher', 'gender'];

    protected array $with = ['branch:id,name', 'department:id,name', 'jobTitle:id,name'];

    protected array $sortable = ['id', 'name', 'number', 'hire_date', 'basic_salary'];

    protected string $label = 'موظف';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'                => [$record ? 'sometimes' : 'required', 'string', 'max:255'],
            'national_id'         => ['nullable', 'string', 'max:40'],
            'nationality'         => ['nullable', 'string', 'max:80'],
            'gender'              => ['nullable', 'in:male,female'],
            'birth_date'          => ['nullable', 'date'],
            'phone'               => ['nullable', 'string', 'max:40'],
            'email'               => ['nullable', 'email'],
            'branch_id'           => ['nullable', 'integer', $this->owned('branches')],
            'department_id'       => ['nullable', 'integer', $this->owned('departments')],
            'job_title_id'        => ['nullable', 'integer', $this->owned('job_titles')],
            'is_teacher'          => ['boolean'],
            'hire_date'           => ['nullable', 'date'],
            'status'              => ['nullable', 'in:active,on_leave,terminated'],
            'basic_salary'        => ['nullable', 'numeric', 'min:0'],
            'housing_allowance'   => ['nullable', 'numeric', 'min:0'],
            'transport_allowance' => ['nullable', 'numeric', 'min:0'],
            'other_allowance'     => ['nullable', 'numeric', 'min:0'],
            'bank_name'           => ['nullable', 'string', 'max:120'],
            'iban'                => ['nullable', 'string', 'max:60'],
            'address'             => ['nullable', 'string', 'max:255'],
            'notes'               => ['nullable', 'string'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if (! $record) {
            $data['number'] = Numbering::next(Employee::class, 'EMP-');
        }

        return $data;
    }

    protected function transform(Model $record, bool $detail = false)
    {
        $record->total_salary = round((float) $record->basic_salary + $record->allowances(), 3);
        if ($detail) {
            $record->leaves = LeaveRequest::with('leaveType:id,name')->where('employee_id', $record->id)->orderByDesc('from_date')->limit(10)->get();
            $record->advances = EmployeeAdvance::where('employee_id', $record->id)->orderByDesc('date')->get();
            $record->payslips = PayrollItem::where('employee_id', $record->id)->join('payrolls', 'payrolls.id', '=', 'payroll_items.payroll_id')
                ->orderByDesc('payrolls.month')->limit(12)->get(['payrolls.month', 'payrolls.status', 'payroll_items.*']);
            $record->contracts = EmployeeContract::where('employee_id', $record->id)->orderByDesc('id')->get();
            $record->evaluations = Evaluation::with('period:id,name')->where('employee_id', $record->id)->orderByDesc('id')->limit(6)->get();
            $month = now()->format('Y-m');
            $record->attendance_month = EmployeeAttendance::where('employee_id', $record->id)->where('date', 'like', $month.'%')
                ->selectRaw('status, COUNT(*) c')->groupBy('status')->pluck('c', 'status');
        }

        return $record;
    }

    protected function cannotDelete(Model $record): ?string
    {
        return PayrollItem::where('employee_id', $record->id)->exists() ? 'لا يمكن حذف موظف له رواتب مسجّلة — غيّر حالته إلى منتهي الخدمة.' : null;
    }
}

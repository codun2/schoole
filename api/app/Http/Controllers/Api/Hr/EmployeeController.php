<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Api\ResourceController;
use App\Http\Controllers\Concerns\UniqueContactEmail;
use App\Models\Employee;
use App\Models\EmployeeAdvance;
use App\Models\EmployeeAttendance;
use App\Models\LeaveRequest;
use App\Models\EmployeeContract;
use App\Models\Evaluation;
use App\Models\PayrollItem;
use App\Models\User;
use App\Support\Numbering;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class EmployeeController extends ResourceController
{
    use UniqueContactEmail;

    protected string $model = Employee::class;

    protected array $search = ['name', 'number', 'national_id', 'phone', 'email'];

    protected array $filters = ['status', 'department_id', 'branch_id', 'job_title_id', 'is_teacher', 'gender'];

    protected array $with = ['branch:id,name', 'department:id,name', 'jobTitle:id,name', 'user:id,email,role'];

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
            'email'               => ['nullable', 'email', 'max:255', $this->uniqueEmailRule($record, 'employee')],
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
            'login_password'      => ['nullable', 'string', 'min:6'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        unset($data['login_password']);
        if (! $record) {
            $data['number'] = Numbering::next(Employee::class, 'EMP-');
        }

        return $data;
    }

    /**
     * Optional teacher-portal login (role=teacher), keyed by the employee's
     * email or phone. Only teaching staff may own a login.
     */
    protected function afterSave(Model $record, Request $request, bool $created): void
    {
        if (! $request->filled('login_password')) {
            return;
        }
        if (! $record->is_teacher) {
            throw ValidationException::withMessages(['login_password' => ['حساب الدخول متاح لأعضاء الهيئة التدريسية فقط.']]);
        }
        if (! $record->email && ! $record->phone) {
            throw ValidationException::withMessages(['login_password' => ['أدخل البريد أو الجوال أولاً ليتمكن المعلم من الدخول.']]);
        }
        $email = $record->email ?: $record->phone.'@teacher.local';
        $attrs = ['name' => $record->name, 'phone' => $record->phone, 'email' => $email, 'password' => $request->login_password];

        if ($record->user_id && ($u = User::find($record->user_id))) {
            $u->update($attrs);

            return;
        }
        $taken = User::where(fn ($q) => $q->where('email', $email)->when($record->phone, fn ($w) => $w->orWhere('phone', $record->phone)))->exists();
        if ($taken) {
            throw ValidationException::withMessages(['login_password' => ['هذا البريد/الجوال مستخدم لحساب دخول آخر.']]);
        }
        $u = User::create($attrs + ['role' => 'teacher', 'status' => 'active']);
        $record->user_id = $u->id;
        $record->save();
    }

    protected function transform(Model $record, bool $detail = false)
    {
        $record->total_salary = round((float) $record->basic_salary + $record->allowances(), 3);
        $record->has_login = $record->user_id !== null;
        $record->login_email = $record->relationLoaded('user') ? $record->user?->email : null;
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

    protected function beforeDelete(Model $record): void
    {
        if ($record->user_id) {
            User::where('id', $record->user_id)->where('role', 'teacher')->delete();
        }
    }
}

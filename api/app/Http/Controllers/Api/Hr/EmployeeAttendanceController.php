<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeAttendance;
use Illuminate\Http\Request;

/** Staff check-in/out: daily sheet for all active employees, bulk save, monthly summary. */
class EmployeeAttendanceController extends Controller
{
    public function sheet(Request $request)
    {
        $data = $request->validate(['date' => ['required', 'date'], 'branch_id' => ['nullable', 'integer'], 'department_id' => ['nullable', 'integer']]);
        $marks = EmployeeAttendance::whereDate('date', $data['date'])->get()->keyBy('employee_id');
        $emps = Employee::with('department:id,name', 'jobTitle:id,name')->whereIn('status', ['active', 'on_leave'])
            ->when($data['branch_id'] ?? null, fn ($q, $v) => $q->where('branch_id', $v))
            ->when($data['department_id'] ?? null, fn ($q, $v) => $q->where('department_id', $v))
            ->orderBy('name')->get();

        return response()->json(['date' => $data['date'], 'employees' => $emps->map(fn ($e) => [
            'id'         => $e->id,
            'number'     => $e->number,
            'name'       => $e->name,
            'department' => $e->department?->name,
            'job_title'  => $e->jobTitle?->name,
            'status'     => $marks[$e->id]->status ?? ($e->status === 'on_leave' ? 'leave' : null),
            'check_in'   => isset($marks[$e->id]) ? substr((string) $marks[$e->id]->check_in, 0, 5) : null,
            'check_out'  => isset($marks[$e->id]) ? substr((string) $marks[$e->id]->check_out, 0, 5) : null,
            'note'       => $marks[$e->id]->note ?? null,
        ])]);
    }

    public function save(Request $request)
    {
        $data = $request->validate([
            'date'                => ['required', 'date', 'before_or_equal:today'],
            'marks'               => ['required', 'array'],
            'marks.*.employee_id' => ['required', 'integer', $this->owned('employees')],
            'marks.*.status'      => ['required', 'in:present,absent,late,leave'],
            'marks.*.check_in'    => ['nullable', 'date_format:H:i'],
            'marks.*.check_out'   => ['nullable', 'date_format:H:i'],
            'marks.*.note'        => ['nullable', 'string', 'max:255'],
        ]);
        foreach ($data['marks'] as $m) {
            EmployeeAttendance::updateOrCreate(
                ['employee_id' => $m['employee_id'], 'date' => $data['date']],
                ['status' => $m['status'], 'check_in' => $m['check_in'] ?? null, 'check_out' => $m['check_out'] ?? null, 'note' => $m['note'] ?? null]
            );
        }

        return response()->json(['message' => 'تم حفظ حضور الموظفين.']);
    }

    public function summary(Request $request)
    {
        $month = $request->validate(['month' => ['required', 'date_format:Y-m']])['month'];
        $rows = EmployeeAttendance::where('date', 'like', $month.'%')
            ->selectRaw("employee_id, SUM(status='present') present, SUM(status='absent') absent, SUM(status='late') late, SUM(status='leave') `leave`")
            ->groupBy('employee_id')->get()->keyBy('employee_id');

        return response()->json(Employee::where('status', '!=', 'terminated')->orderBy('name')->get(['id', 'number', 'name'])->map(fn ($e) => [
            'id'      => $e->id,
            'number'  => $e->number,
            'name'    => $e->name,
            'present' => (int) ($rows[$e->id]->present ?? 0),
            'absent'  => (int) ($rows[$e->id]->absent ?? 0),
            'late'    => (int) ($rows[$e->id]->late ?? 0),
            'leave'   => (int) ($rows[$e->id]->leave ?? 0),
        ]));
    }
}

<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Api\ResourceController;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class LeaveTypeController extends ResourceController
{
    protected string $model = LeaveType::class;

    protected array $search = ['name'];

    protected string $dir = 'asc';

    protected string $label = 'نوع إجازة';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'          => [$record ? 'sometimes' : 'required', 'string', 'max:120'],
            'name_en'         => ['nullable', 'string', 'max:255'],
            'days_per_year' => ['nullable', 'integer', 'min:0'],
            'is_paid'       => ['boolean'],
        ];
    }

    protected function cannotDelete(Model $record): ?string
    {
        return LeaveRequest::where('leave_type_id', $record->id)->exists() ? 'لا يمكن حذف نوع مستخدم في طلبات.' : null;
    }

    /** Leave balances: allowed vs approved days this year, per employee and type. */
    public function balances(Request $request)
    {
        $year = (int) ($request->year ?: date('Y'));
        $types = LeaveType::orderBy('id')->get();
        $used = LeaveRequest::where('status', 'approved')->whereYear('from_date', $year)
            ->selectRaw('employee_id, leave_type_id, SUM(days) d')->groupBy('employee_id', 'leave_type_id')->get()
            ->groupBy('employee_id');

        $rows = \App\Models\Employee::where('status', '!=', 'terminated')->orderBy('name')->get(['id', 'number', 'name', 'name_en'])->map(function ($e) use ($types, $used) {
            $mine = ($used[$e->id] ?? collect())->keyBy('leave_type_id');

            return [
                'id'     => $e->id,
                'number' => $e->number,
                'name'   => $e->name,
                'name_en'=> $e->name_en,
                'types'  => $types->map(fn ($t) => ['type_id' => $t->id, 'allowed' => $t->days_per_year, 'used' => (int) ($mine[$t->id]->d ?? 0), 'left' => max(0, $t->days_per_year - (int) ($mine[$t->id]->d ?? 0))]),
            ];
        });

        return response()->json(['types' => $types, 'rows' => $rows]);
    }
}

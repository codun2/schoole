<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Api\ResourceController;
use App\Models\LeaveRequest;
use App\Support\Activity;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class LeaveRequestController extends ResourceController
{
    protected string $model = LeaveRequest::class;

    protected array $search = ['employee.name', 'reason'];

    protected array $filters = ['status', 'employee_id', 'leave_type_id'];

    protected array $with = ['employee:id,name,number', 'leaveType:id,name'];

    protected ?string $dateColumn = 'from_date';

    protected string $label = 'طلب إجازة';

    protected function rules(Request $request, ?Model $record): array
    {
        $req = $record ? 'sometimes' : 'required';

        return [
            'employee_id'   => [$req, 'integer', $this->owned('employees')],
            'leave_type_id' => [$req, 'integer', $this->owned('leave_types')],
            'from_date'     => [$req, 'date'],
            'to_date'       => [$req, 'date', 'after_or_equal:from_date'],
            'reason'        => ['nullable', 'string', 'max:255'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        $from = $data['from_date'] ?? $record?->from_date;
        $to = $data['to_date'] ?? $record?->to_date;
        $data['days'] = Carbon::parse($from)->diffInDays(Carbon::parse($to)) + 1;

        return $data;
    }

    public function decide(Request $request, $id)
    {
        $lr = $this->find($id);
        $status = $request->validate(['status' => ['required', 'in:approved,rejected']])['status'];
        $lr->update(['status' => $status, 'decided_by' => $request->user()->id]);
        Activity::log($status, $lr, ($status === 'approved' ? 'اعتماد' : 'رفض').' إجازة: '.$lr->employee?->name);

        return response()->json(['message' => $status === 'approved' ? 'تم اعتماد الإجازة.' : 'تم رفض الإجازة.']);
    }
}

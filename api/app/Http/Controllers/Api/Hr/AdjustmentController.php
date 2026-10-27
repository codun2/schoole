<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Api\ResourceController;
use App\Models\EmployeeAdjustment;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/** One-off bonuses (مكافآت) and deductions (استقطاعات) for a payroll month. */
class AdjustmentController extends ResourceController
{
    protected string $model = EmployeeAdjustment::class;

    protected array $search = ['employee.name', 'title'];

    protected array $filters = ['type', 'employee_id', 'month'];

    protected array $with = ['employee:id,name,name_en,number'];

    protected string $label = 'مكافأة/استقطاع';

    protected function rules(Request $request, ?Model $record): array
    {
        $req = $record ? 'sometimes' : 'required';

        return [
            'employee_id' => [$req, 'integer', $this->owned('employees')],
            'type'        => [$req, 'in:bonus,deduction'],
            'title'       => [$req, 'string', 'max:120'],
            'amount'      => [$req, 'numeric', 'min:0.001'],
            'month'       => [$req, 'date_format:Y-m'],
            'notes'       => ['nullable', 'string', 'max:255'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if ($record && $record->payroll_id) {
            abort(response()->json(['message' => 'تم احتسابها في مسيّر رواتب معتمد.'], 422));
        }

        return $data;
    }

    protected function cannotDelete(Model $record): ?string
    {
        return $record->payroll_id ? 'تم احتسابها في مسيّر رواتب — لا يمكن حذفها.' : null;
    }
}

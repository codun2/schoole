<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Api\ResourceController;
use App\Models\EmployeeAdvance;
use App\Models\Voucher;
use App\Support\Finance;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/** Salary advances (سلف): paid out via a payment voucher, recovered monthly through payroll. */
class AdvanceController extends ResourceController
{
    protected string $model = EmployeeAdvance::class;

    protected array $search = ['employee.name', 'notes'];

    protected array $filters = ['status', 'employee_id'];

    protected array $with = ['employee:id,name,name_en,number'];

    protected ?string $dateColumn = 'date';

    protected string $label = 'سلفة';

    protected function rules(Request $request, ?Model $record): array
    {
        $req = $record ? 'sometimes' : 'required';

        return [
            'employee_id'       => [$req, 'integer', $this->owned('employees')],
            'date'              => [$req, 'date'],
            'amount'            => [$req, 'numeric', 'min:0.001'],
            'monthly_deduction' => [$req, 'numeric', 'min:0'],
            'notes'             => ['nullable', 'string', 'max:255'],
            'cash_account_id'   => ['nullable', 'integer', $this->owned('cash_accounts')],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if ($record && (float) $record->remaining < (float) $record->amount) {
            abort(response()->json(['message' => 'لا يمكن تعديل سلفة بدأ استقطاعها.'], 422));
        }
        if (isset($data['amount'])) {
            $data['remaining'] = $data['amount'];
            $data['status'] = 'active';
        }

        return collect($data)->except('cash_account_id')->all();
    }

    protected function afterSave(Model $record, Request $request, bool $created): void
    {
        $record->loadMissing('employee');
        $v = Voucher::where('source_type', 'advance')->where('source_id', $record->id)->first();
        if ($v) {
            $v->update(['amount' => $record->amount, 'date' => $record->date]);
        } else {
            Finance::voucher('payment', [
                'date'            => $record->date->toDateString(),
                'amount'          => $record->amount,
                'cash_account_id' => $request->cash_account_id,
                'category'        => 'advance',
                'party_type'      => 'employee',
                'party_id'        => $record->employee_id,
                'party_name'      => $record->employee?->name,
                'party_name_en'   => $record->employee?->name_en,
                'source_type'     => 'advance',
                'source_id'       => $record->id,
                'description'     => 'سلفة موظف — '.$record->employee?->name,
                'description_en'  => 'Employee advance — '.($record->employee?->name_en ?: $record->employee?->name),
            ]);
        }
    }

    protected function cannotDelete(Model $record): ?string
    {
        return (float) $record->remaining < (float) $record->amount ? 'لا يمكن حذف سلفة بدأ استقطاعها.' : null;
    }

    protected function beforeDelete(Model $record): void
    {
        Voucher::where('source_type', 'advance')->where('source_id', $record->id)->get()->each->delete(); // per-model → sync tombstones
    }
}

<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Api\ResourceController;
use App\Http\Controllers\Concerns\HandlesUploads;
use App\Models\EmployeeContract;
use App\Support\Numbering;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/** Employment contracts with expiry tracking (valid / expiring ≤30d / expired). */
class EmployeeContractController extends ResourceController
{
    use HandlesUploads;

    protected string $model = EmployeeContract::class;

    protected array $search = ['number', 'employee.name', 'employee.number'];

    protected array $filters = ['type', 'status', 'employee_id'];

    protected array $with = ['employee:id,name,number'];

    protected array $sortable = ['id', 'start_date', 'end_date'];

    protected string $order = 'id';

    protected string $label = 'عقد موظف';

    public const TYPES = ['permanent', 'fixed', 'part_time'];

    protected function rules(Request $request, ?Model $record): array
    {
        $req = $record ? 'sometimes' : 'required';

        return [
            'employee_id'  => [$req, 'integer', $this->owned('employees')],
            'type'         => ['nullable', 'in:'.implode(',', self::TYPES)],
            'start_date'   => [$req, 'date'],
            'end_date'     => ['nullable', 'date', 'after_or_equal:start_date'],
            'basic_salary' => ['nullable', 'numeric', 'min:0'],
            'allowances'   => ['nullable', 'numeric', 'min:0'],
            'status'       => ['nullable', 'in:active,expired,terminated'],
            'notes'        => ['nullable', 'string'],
            'file'         => ['nullable', 'file', 'max:10240'],
        ];
    }

    protected function extraFilters(Builder $query, Request $request): void
    {
        $today = now()->toDateString();
        match ($request->state) {
            'expired'  => $query->where('status', '!=', 'terminated')->whereNotNull('end_date')->whereDate('end_date', '<', $today),
            'expiring' => $query->where('status', '!=', 'terminated')->whereBetween('end_date', [$today, now()->addDays(30)->toDateString()]),
            default    => null,
        };
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if (! $record) {
            $data['number'] = Numbering::next(EmployeeContract::class, 'EC-'.date('Y').'-', 4);
        }
        if ($request->hasFile('file')) {
            $data['attachment'] = $this->storeImage($request->file('file'), 'contracts');
        }
        unset($data['file']);

        return $data;
    }
}

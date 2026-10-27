<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Api\ResourceController;
use App\Models\Department;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class DepartmentController extends ResourceController
{
    protected string $model = Department::class;

    protected array $search = ['name'];

    protected array $with = ['manager:id,name,name_en'];

    protected array $withCount = ['employees'];

    protected string $dir = 'asc';

    protected string $label = 'قسم';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'       => [$record ? 'sometimes' : 'required', 'string', 'max:120'],
            'name_en'      => ['nullable', 'string', 'max:255'],
            'manager_id' => ['nullable', 'integer', $this->owned('employees')],
        ];
    }

    protected function cannotDelete(Model $record): ?string
    {
        return $record->employees()->exists() ? 'لا يمكن حذف قسم فيه موظفون.' : null;
    }
}

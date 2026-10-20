<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Api\ResourceController;
use App\Models\Branch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class BranchController extends ResourceController
{
    protected string $model = Branch::class;

    protected array $search = ['name', 'city'];

    protected string $dir = 'asc';

    protected string $label = 'فرع';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'    => [$record ? 'sometimes' : 'required', 'string', 'max:120'],
            'city'    => ['nullable', 'string', 'max:120'],
            'phone'   => ['nullable', 'string', 'max:40'],
            'address' => ['nullable', 'string', 'max:255'],
            'is_main' => ['boolean'],
        ];
    }

    protected function cannotDelete(Model $record): ?string
    {
        if ($record->is_main) {
            return 'لا يمكن حذف الفرع الرئيسي.';
        }

        return \App\Models\Employee::where('branch_id', $record->id)->exists() ? 'لا يمكن حذف فرع فيه موظفون.' : null;
    }
}

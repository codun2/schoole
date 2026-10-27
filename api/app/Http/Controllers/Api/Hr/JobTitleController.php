<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Api\ResourceController;
use App\Models\JobTitle;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class JobTitleController extends ResourceController
{
    protected string $model = JobTitle::class;

    protected array $search = ['name'];

    protected array $filters = ['department_id'];

    protected array $with = ['department:id,name,name_en'];

    protected array $withCount = ['employees'];

    protected string $dir = 'asc';

    protected string $label = 'مسمى وظيفي';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'          => [$record ? 'sometimes' : 'required', 'string', 'max:120'],
            'name_en'         => ['nullable', 'string', 'max:255'],
            'department_id' => ['nullable', 'integer', $this->owned('departments')],
        ];
    }

    protected function cannotDelete(Model $record): ?string
    {
        return $record->employees()->exists() ? 'لا يمكن حذف مسمى مستخدم.' : null;
    }
}

<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ResourceController;
use App\Models\Correspondence;
use App\Models\CorrespondenceCategory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class CorrespondenceCategoryController extends ResourceController
{
    protected string $model = CorrespondenceCategory::class;

    protected array $search = ['name'];

    protected string $dir = 'asc';

    protected string $label = 'فئة مراسلات';

    protected function rules(Request $request, ?Model $record): array
    {
        return ['name' => [$record ? 'sometimes' : 'required', 'string', 'max:120']];
    }

    protected function cannotDelete(Model $record): ?string
    {
        return Correspondence::where('category_id', $record->id)->exists() ? 'لا يمكن حذف فئة مستخدمة.' : null;
    }
}

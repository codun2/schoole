<?php

namespace App\Http\Controllers\Api\Inventory;

use App\Http\Controllers\Api\ResourceController;
use App\Models\InventoryCategory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class InventoryCategoryController extends ResourceController
{
    protected string $model = InventoryCategory::class;

    protected array $search = ['name'];

    protected array $withCount = ['items'];

    protected array $sortable = ['id', 'sort', 'name'];

    protected string $order = 'sort';

    protected string $dir = 'asc';

    protected string $label = 'فئة مخزون';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name' => [$record ? 'sometimes' : 'required', 'string', 'max:120'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'sort' => ['nullable', 'integer', 'min:0'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if (array_key_exists('sort', $data) && $data['sort'] === null) {
            $data['sort'] = 0; // empty form field → column default
        }

        return $data;
    }

    protected function cannotDelete(Model $record): ?string
    {
        return $record->items()->exists() ? 'لا يمكن حذف فئة فيها أصناف — انقل الأصناف أولاً.' : null;
    }
}

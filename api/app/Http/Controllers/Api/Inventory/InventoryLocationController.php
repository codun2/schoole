<?php

namespace App\Http\Controllers\Api\Inventory;

use App\Http\Controllers\Api\ResourceController;
use App\Models\InventoryLocation;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class InventoryLocationController extends ResourceController
{
    protected string $model = InventoryLocation::class;

    protected array $search = ['name', 'notes'];

    protected array $withCount = ['items'];

    protected array $sortable = ['id', 'name'];

    protected string $order = 'name';

    protected string $dir = 'asc';

    protected string $label = 'موقع مخزن';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'  => [$record ? 'sometimes' : 'required', 'string', 'max:120'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ];
    }

    protected function cannotDelete(Model $record): ?string
    {
        return $record->items()->exists() ? 'لا يمكن حذف موقع فيه أصناف — انقلها إلى موقع آخر أولاً.' : null;
    }
}

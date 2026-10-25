<?php

namespace App\Http\Controllers\Api\Inventory;

use App\Http\Controllers\Api\ResourceController;
use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * Inventory items (assets + consumables). The quantity is a ledger balance: it is set on creation
 * (as an opening "in" movement) and afterwards only changes through InventoryMovementController.
 */
class InventoryItemController extends ResourceController
{
    protected string $model = InventoryItem::class;

    protected array $search = ['name', 'serial_no', 'unit', 'notes'];

    protected array $filters = ['category_id', 'location_id', 'type', 'condition'];

    protected array $with = ['category:id,name', 'location:id,name'];

    protected array $sortable = ['id', 'name', 'quantity', 'unit_cost', 'purchase_date', 'created_at'];

    protected string $order = 'name';

    protected string $dir = 'asc';

    protected string $label = 'صنف';

    protected function rules(Request $request, ?Model $record): array
    {
        $req = $record ? 'sometimes' : 'required';

        return [
            'name'          => [$req, 'string', 'max:255'],
            'type'          => ['nullable', 'in:'.implode(',', InventoryItem::TYPES)],
            'category_id'   => ['nullable', 'integer', $this->owned('inventory_categories')],
            'location_id'   => ['nullable', 'integer', $this->owned('inventory_locations')],
            'unit'          => ['nullable', 'string', 'max:30'],
            'quantity'      => ['nullable', 'numeric', 'min:0'],
            'min_quantity'  => ['nullable', 'numeric', 'min:0'],
            'condition'     => ['nullable', 'in:'.implode(',', InventoryItem::CONDITIONS)],
            'unit_cost'     => ['nullable', 'numeric', 'min:0'],
            'purchase_date' => ['nullable', 'date'],
            'serial_no'     => ['nullable', 'string', 'max:80'],
            'notes'         => ['nullable', 'string'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if ($record) {
            unset($data['quantity']); // balances change only through movements, never by editing the item
        }
        // empty form fields arrive as null; the columns are NOT NULL with defaults
        foreach (['type' => 'asset', 'condition' => 'good', 'quantity' => 0, 'min_quantity' => 0, 'unit_cost' => 0] as $k => $def) {
            if (array_key_exists($k, $data) && $data[$k] === null) {
                $data[$k] = $def;
            }
        }

        return $data;
    }

    /** Opening balance becomes the first "in" movement so the ledger explains every quantity. */
    protected function afterSave(Model $record, Request $request, bool $created): void
    {
        if ($created && (float) $record->quantity > 0) {
            InventoryMovement::create([
                'item_id'        => $record->id,
                'type'           => 'in',
                'quantity'       => $record->quantity,
                'to_location_id' => $record->location_id,
                'date'           => $record->purchase_date?->toDateString() ?? now()->toDateString(),
                'reason'         => 'رصيد افتتاحي',
                'created_by'     => $request->user()->id,
            ]);
        }
    }

    protected function extraFilters(Builder $query, Request $request): void
    {
        if ($request->boolean('low')) {
            $query->where('type', 'consumable')->where('min_quantity', '>', 0)->whereColumn('quantity', '<=', 'min_quantity');
        }
    }

    protected function beforeDelete(Model $record): void
    {
        $record->movements()->get()->each->delete(); // per-model so sync tombstones are written
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryItem extends TenantModel
{
    public const TYPES = ['asset', 'consumable'];

    public const CONDITIONS = ['good', 'needs_repair', 'damaged'];

    protected $casts = ['quantity' => 'decimal:2', 'min_quantity' => 'decimal:2', 'unit_cost' => 'decimal:3', 'purchase_date' => 'date:Y-m-d'];

    public function category(): BelongsTo
    {
        return $this->belongsTo(InventoryCategory::class, 'category_id');
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(InventoryLocation::class, 'location_id');
    }

    public function movements(): HasMany
    {
        return $this->hasMany(InventoryMovement::class, 'item_id');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryMovement extends TenantModel
{
    public const TYPES = ['in', 'out', 'transfer', 'adjust', 'dispose'];

    protected $casts = ['quantity' => 'decimal:2', 'date' => 'date:Y-m-d'];

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'item_id');
    }

    public function fromLocation(): BelongsTo
    {
        return $this->belongsTo(InventoryLocation::class, 'from_location_id');
    }

    public function toLocation(): BelongsTo
    {
        return $this->belongsTo(InventoryLocation::class, 'to_location_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

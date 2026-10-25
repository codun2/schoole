<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryLocation extends TenantModel
{
    public function items(): HasMany
    {
        return $this->hasMany(InventoryItem::class, 'location_id');
    }
}

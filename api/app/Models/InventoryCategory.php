<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryCategory extends TenantModel
{
    public function items(): HasMany
    {
        return $this->hasMany(InventoryItem::class, 'category_id');
    }
}

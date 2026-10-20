<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FeeItem extends TenantModel
{
    protected $casts = ['amount' => 'decimal:3', 'is_mandatory' => 'boolean', 'taxable' => 'boolean'];
    public function grade(): BelongsTo { return $this->belongsTo(Grade::class); }
}

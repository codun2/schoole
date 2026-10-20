<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class License extends TenantModel
{
    protected $casts = ['issue_date' => 'date:Y-m-d', 'expiry_date' => 'date:Y-m-d', 'cost' => 'decimal:3'];
    protected $appends = ['state'];
    public function getStateAttribute(): string
    {
        if (! $this->expiry_date) return 'valid';
        if ($this->expiry_date->isPast()) return 'expired';
        return $this->expiry_date->diffInDays(now()) <= 30 ? 'expiring' : 'valid';
    }
}

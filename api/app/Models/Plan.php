<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Subscription plan offered by the platform to schools. */
class Plan extends Model
{
    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = ['features' => 'array', 'is_active' => 'boolean', 'price_monthly' => 'decimal:3', 'price_yearly' => 'decimal:3'];

    public function companies(): HasMany
    {
        return $this->hasMany(Company::class);
    }
}

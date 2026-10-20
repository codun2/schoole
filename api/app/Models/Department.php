<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Department extends TenantModel
{
    public function employees(): HasMany { return $this->hasMany(Employee::class); }
    public function manager(): BelongsTo { return $this->belongsTo(Employee::class, 'manager_id'); }
}

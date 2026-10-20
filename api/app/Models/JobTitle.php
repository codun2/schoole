<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JobTitle extends TenantModel
{
    public function department(): BelongsTo { return $this->belongsTo(Department::class); }
    public function employees(): HasMany { return $this->hasMany(Employee::class); }
}

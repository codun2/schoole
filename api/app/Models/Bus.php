<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Bus extends TenantModel
{
    protected $table = 'buses';
    protected $casts = ['price' => 'decimal:3'];
    public function students(): HasMany { return $this->hasMany(Student::class); }
}

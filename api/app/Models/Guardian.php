<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Guardian extends TenantModel
{
    protected $casts = ['custom' => 'array'];
    public function students(): HasMany { return $this->hasMany(Student::class); }
    public function contracts(): HasMany { return $this->hasMany(Contract::class); }
}

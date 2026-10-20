<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Application extends TenantModel
{
    protected $casts = ['birth_date' => 'date:Y-m-d'];
    public function grade(): BelongsTo { return $this->belongsTo(Grade::class); }
}

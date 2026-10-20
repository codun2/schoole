<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Subject extends TenantModel
{
    protected $casts = ['max_mark' => 'decimal:2', 'pass_mark' => 'decimal:2'];

    public function grade(): BelongsTo
    {
        return $this->belongsTo(Grade::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ActivityLog extends TenantModel
{
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}

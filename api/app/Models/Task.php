<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Task extends TenantModel
{
    protected $casts = ['start_date' => 'date:Y-m-d', 'end_date' => 'date:Y-m-d'];
    public function branch(): BelongsTo { return $this->belongsTo(Branch::class); }
    public function assignee(): BelongsTo { return $this->belongsTo(User::class, 'assigned_to'); }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Correspondence extends TenantModel
{
    protected $casts = ['date' => 'date:Y-m-d'];
    public function category(): BelongsTo { return $this->belongsTo(CorrespondenceCategory::class); }
    public function assignee(): BelongsTo { return $this->belongsTo(User::class, 'assigned_to'); }
}

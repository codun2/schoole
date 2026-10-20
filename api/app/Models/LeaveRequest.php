<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LeaveRequest extends TenantModel
{
    protected $casts = ['from_date' => 'date:Y-m-d', 'to_date' => 'date:Y-m-d'];
    public function employee(): BelongsTo { return $this->belongsTo(Employee::class); }
    public function leaveType(): BelongsTo { return $this->belongsTo(LeaveType::class); }
}

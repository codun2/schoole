<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EmployeeAttendance extends TenantModel
{
    protected $casts = ['date' => 'date:Y-m-d'];
    public function employee(): BelongsTo { return $this->belongsTo(Employee::class); }
}

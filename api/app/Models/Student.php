<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Student extends TenantModel
{
    protected $casts = ['custom' => 'array', 'birth_date' => 'date:Y-m-d', 'registered_at' => 'date:Y-m-d'];
    public function guardian(): BelongsTo { return $this->belongsTo(Guardian::class); }
    public function grade(): BelongsTo { return $this->belongsTo(Grade::class); }
    public function section(): BelongsTo { return $this->belongsTo(Section::class); }
    public function bus(): BelongsTo { return $this->belongsTo(Bus::class); }
    public function contracts(): HasMany { return $this->hasMany(Contract::class); }
    public function attendances(): HasMany { return $this->hasMany(StudentAttendance::class); }
}

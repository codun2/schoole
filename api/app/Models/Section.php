<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Section extends TenantModel
{
    public function grade(): BelongsTo { return $this->belongsTo(Grade::class); }
    public function students(): HasMany { return $this->hasMany(Student::class); }
    public function teacher(): BelongsTo { return $this->belongsTo(Employee::class, 'teacher_id'); }
}

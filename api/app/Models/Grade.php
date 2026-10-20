<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Grade extends TenantModel
{
    public function sections(): HasMany { return $this->hasMany(Section::class); }
    public function students(): HasMany { return $this->hasMany(Student::class); }
    public function year(): BelongsTo { return $this->belongsTo(AcademicYear::class, 'academic_year_id'); }
}

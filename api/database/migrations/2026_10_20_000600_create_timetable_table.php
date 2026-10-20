<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Weekly class timetable: one cell per (section, day, period). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('timetable_entries', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('academic_year_id')->index();
            $t->unsignedBigInteger('section_id')->index();
            $t->unsignedTinyInteger('day');    // 0=Sun .. 6=Sat
            $t->unsignedTinyInteger('period'); // 1..N
            $t->unsignedBigInteger('subject_id')->nullable();
            $t->unsignedBigInteger('teacher_id')->nullable();
            $t->string('room')->nullable();
            $t->timestamps();
            $t->unique(['section_id', 'day', 'period'], 'slot_unique');
            $t->index(['teacher_id', 'day', 'period']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('timetable_entries');
    }
};

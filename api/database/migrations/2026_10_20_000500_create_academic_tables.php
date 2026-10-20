<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Academic layer: subjects, exam terms (with weights), and per-student grade marks. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subjects', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('academic_year_id')->index();
            $t->unsignedBigInteger('grade_id')->nullable()->index(); // null = all grades
            $t->string('name_ar');
            $t->string('name_en')->nullable();
            $t->string('code', 20)->nullable();
            $t->decimal('max_mark', 6, 2)->default(100);
            $t->decimal('pass_mark', 6, 2)->default(50);
            $t->unsignedInteger('sort')->default(0);
            $t->timestamps();
        });

        Schema::create('exam_terms', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('academic_year_id')->index();
            $t->string('name'); // الفصل الأول، منتصف العام، النهائي ...
            $t->decimal('weight', 5, 2)->default(100); // contribution to the final result (%)
            $t->unsignedInteger('sort')->default(0);
            $t->boolean('is_locked')->default(false); // locked = no more edits
            $t->timestamps();
        });

        // One mark per (student, subject, term). section/grade copied for fast filtering.
        Schema::create('grade_marks', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('academic_year_id')->index();
            $t->unsignedBigInteger('student_id')->index();
            $t->unsignedBigInteger('section_id')->nullable()->index();
            $t->unsignedBigInteger('grade_id')->nullable()->index();
            $t->unsignedBigInteger('subject_id')->index();
            $t->unsignedBigInteger('exam_term_id')->index();
            $t->decimal('mark', 6, 2)->nullable();
            $t->string('note')->nullable();
            $t->timestamps();
            $t->unique(['student_id', 'subject_id', 'exam_term_id'], 'mark_unique');
        });
    }

    public function down(): void
    {
        foreach (['grade_marks', 'exam_terms', 'subjects'] as $tbl) {
            Schema::dropIfExists($tbl);
        }
    }
};

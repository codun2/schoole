<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Teacher homework / quizzes / exams, and each student's submission + mark for them. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assignments', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('academic_year_id')->index();
            $t->unsignedBigInteger('teacher_id')->index(); // employees.id
            $t->unsignedBigInteger('section_id')->index();
            $t->unsignedBigInteger('subject_id')->nullable()->index();
            $t->string('type', 12)->default('homework'); // homework | quiz | exam
            $t->string('title');
            $t->text('description')->nullable();
            $t->date('due_date')->index();          // homework: hand-in date; quiz/exam: the day it is held
            $t->string('due_time', 5)->nullable();  // HH:MM, mainly for exams
            $t->unsignedSmallInteger('duration_minutes')->nullable();
            $t->decimal('max_mark', 6, 2)->default(10);
            $t->string('attachment')->nullable();   // /storage/assignments/xxx (worksheet, image…)
            $t->string('status', 12)->default('open'); // open | closed | archived
            $t->timestamps();
        });

        Schema::create('assignment_submissions', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('assignment_id')->index();
            $t->unsignedBigInteger('student_id')->index();
            $t->boolean('submitted')->default(false);
            $t->decimal('mark', 6, 2)->nullable();
            $t->string('note')->nullable();
            $t->timestamps();
            $t->unique(['assignment_id', 'student_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assignment_submissions');
        Schema::dropIfExists('assignments');
    }
};

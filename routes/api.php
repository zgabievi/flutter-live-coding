<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::get('/todos', function () {
    $response = Http::get('https://jsonplaceholder.typicode.com/todos');

    return $response->json();
});

Route::get('/todos/{id}', function ($id) {
    $response = Http::get('https://jsonplaceholder.typicode.com/todos/' . $id);
    
    return $response->json();
});

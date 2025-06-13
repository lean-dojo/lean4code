//@ts-nocheck
'use strict';

const path = require('path');

/** @type {import('webpack').Configuration} */
const config = {
  target: 'node',
  mode: 'none',
  entry: './out/extension.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    vscode: 'commonjs vscode', // ignored because it's provided by VS Code
  },
  resolve: {
    extensions: ['.js'],
  },
  devtool: 'source-map',
};

module.exports = config;
